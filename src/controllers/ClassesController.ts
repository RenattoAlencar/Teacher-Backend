import { Request, Response } from 'express'
import db from '../database/connection'
import convertHourToMinutes from '../utils/convertHourToMinutes'


interface ScheduleItem {
    week_day: number,
    from: string,
    to: string
}

export default class ClassesController {

    //Listagem
    async index(request: Request, response: Response) {
        const filters = request.query

        const week_day = filters.week_day as string
        const subject = filters.subject as string
        const time = filters.time as string


        if (!filters.week_day || !filters.subject || !filters.time) {
            return response.status(400).json({
                error: 'Missing filters to search classes'
            })
        }

        const timeInMinutes = convertHourToMinutes(time)

        const classes = await db('classes')
        .whereExists(function() {
            this.select('class_schedule.*')
            .from('class_schedule')
            .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
            .whereRaw('`class_schedule`.`week_day`= ??',[Number(week_day)])
            .whereRaw('`class_schedule`. `from`<= ??', timeInMinutes)
            .whereRaw('`class_schedule`. `to`> ??', timeInMinutes)
            

        })
        .where('classes.subject', '=',  subject)
        .join('users', 'classes.user_id', '=', 'users.id')
        .select(['classes.*', 'users.*'])

        return response.json(classes)
    }



    async create(request: Request, response: Response) {
        const {
            name,
            avatar,
            whatsapp,
            bio,
            subject,
            cost,
            schedule
        } = request.body

        //Transaction salvar todas as informações no banco de dados juntas
        const trx = await db.transaction()


        try {
            //Inserir no Banco de Dados na Tabela de Users 
            const insertedUsersId = await trx('users').insert({
                name,
                avatar,
                whatsapp,
                bio
            })

            //Buscar o Id do User que está sendo inserido no banco
            const user_id = insertedUsersId[0]

            //Inserir no Banco de Dados na Tabela de Classes

            //Buscar o Id da Classe que está sendo inserido no banco
            const insertedClassesIds = await trx('classes').insert({
                subject,
                cost,
                user_id

            })

            //Buscar Id da Classes
            const class_id = insertedClassesIds[0]

            //Tratamento das Horas - Convertendo as horas em minutos
            const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
                return {
                    class_id,
                    week_day: scheduleItem.week_day,
                    from: convertHourToMinutes(scheduleItem.from),
                    to: convertHourToMinutes(scheduleItem.to)
                }
            })
            //Salvar no banco os Schedules já convertido
            await trx('class_schedule').insert(classSchedule)

            //Caso tudo de certo commit
            await trx.commit()

            return response.status(201).json()
        } catch (error) {
            await trx.rollback()
            return response.status(400).json({ error: 'Unexpected error white creating new class' })
        }
    }
}